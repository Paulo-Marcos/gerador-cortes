# dev.ps1 - Inicia o ambiente local em um unico terminal.
# WHY ReadLineAsync: event handlers .NET (OutputDataReceived) executam ScriptBlocks
# em ThreadPool threads, o que crasha o host PowerShell (exit code 2).
# ReadLineAsync le output de forma assincrona SEM threads extras.

trap {
    Write-Host ""
    Write-Host "  === ERRO FATAL ===" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Pressione ENTER para fechar"
    exit 1
}

$BASE = $PSScriptRoot
$CMD = $env:ComSpec
if ([string]::IsNullOrWhiteSpace($CMD)) {
    $CMD = "cmd.exe"
}

$env:PYTHONUNBUFFERED = "1"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$projectPorts = @(8000, 4300, 3000, 3001)

function Stop-ProcessTree {
    param(
        [int]$ProcessId,
        [switch]$IncludeRoot
    )

    Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ProcessTree -ProcessId $_.ProcessId -IncludeRoot
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }

    if ($IncludeRoot) {
        try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Clear-DevEnvironment {
    Write-Host "  Limpando portas/processos antigos..." -ForegroundColor DarkGray

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

    $allPids = @($pidsByPort) + @($pidsByCmd) |
        Where-Object { $_ -gt 0 -and $_ -ne $PID } |
        Select-Object -Unique

    foreach ($targetPid in $allPids) {
        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Encerrando $($proc.Name) (PID $targetPid)" -ForegroundColor DarkYellow
            Stop-ProcessTree -ProcessId $targetPid -IncludeRoot
        }
    }

    Get-Process -Name ffmpeg -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Get-ConfiguredLogLevel {
    # D-155: app_settings.json vive na pasta do canal ativo
    # (instance/channels/<ativo>/projetos). Resolve via ponteiro active-channel,
    # com fallback ao legado backend/projetos.
    $settingsPath = $null
    $ponteiro = Join-Path $BASE "instance\active-channel"
    if (Test-Path $ponteiro) {
        $canal = (Get-Content -Path $ponteiro -Raw).Trim()
        if ($canal) {
            $canalSettings = Join-Path $BASE "instance\channels\$canal\projetos\app_settings.json"
            if (Test-Path $canalSettings) { $settingsPath = $canalSettings }
        }
    }
    if (-not $settingsPath) {
        $settingsPath = Join-Path $BASE "backend\projetos\app_settings.json"
    }
    if (-not (Test-Path $settingsPath)) {
        return "disabled"
    }

    try {
        $settings = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
        if ($settings.log_level) {
            return [string]$settings.log_level
        }
    } catch {}

    return "disabled"
}

# Cria processo SEM event handlers — usa ReadLineAsync no loop principal
function Start-DevProcess {
    param(
        [string]$Name,
        [string]$Label,
        [string]$Color,
        [string]$FileName,
        [string]$Arguments,
        [string]$WorkingDirectory,
        [hashtable]$EnvVars = @{}
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FileName
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $startInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $startInfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo

    foreach ($key in $EnvVars.Keys) {
        [Environment]::SetEnvironmentVariable($key, $EnvVars[$key], "Process")
    }

    if (-not $process.Start()) {
        throw "Nao foi possivel iniciar $Name."
    }

    # Inicia leituras assincronas (Tasks .NET, sem threads PowerShell)
    return @{
        Name       = $Name
        Label      = $Label
        Color      = $Color
        Process    = $process
        StdOutTask = $process.StandardOutput.ReadLineAsync()
        StdErrTask = $process.StandardError.ReadLineAsync()
    }
}

# Imprime uma linha de servico com cor
function Write-ServiceLine {
    param(
        [string]$Label,
        [string]$Color,
        [string]$Line
    )

    if ($Line -and $Line.Trim() -ne "") {
        $previousColor = [Console]::ForegroundColor
        try {
            [Console]::ForegroundColor = [System.ConsoleColor]::$Color
            [Console]::Write($Label)
            [Console]::ForegroundColor = $previousColor
            [Console]::WriteLine(" $Line")
        } catch {
            [Console]::ForegroundColor = $previousColor
        }
    }
}

# Le output de todos os servicos via polling de Tasks assincronas
function Read-AllServiceOutput {
    param([array]$Services)

    foreach ($svc in $Services) {
        # Stdout
        if ($null -ne $svc.StdOutTask -and $svc.StdOutTask.IsCompleted) {
            $line = $svc.StdOutTask.Result
            if ($null -ne $line) {
                Write-ServiceLine -Label $svc.Label -Color $svc.Color -Line $line
                $svc.StdOutTask = $svc.Process.StandardOutput.ReadLineAsync()
            } else {
                $svc.StdOutTask = $null
            }
        }

        # Stderr
        if ($null -ne $svc.StdErrTask -and $svc.StdErrTask.IsCompleted) {
            $line = $svc.StdErrTask.Result
            if ($null -ne $line) {
                Write-ServiceLine -Label $svc.Label -Color $svc.Color -Line $line
                $svc.StdErrTask = $svc.Process.StandardError.ReadLineAsync()
            } else {
                $svc.StdErrTask = $null
            }
        }
    }
}

Clear-Host
Write-Host ""
Write-Host "  CortadorLive" -ForegroundColor Cyan -NoNewline
Write-Host " - iniciando..." -ForegroundColor DarkGray
Write-Host ""

Clear-DevEnvironment

Write-Host ""
Write-Host "  Backend        " -ForegroundColor DarkCyan -NoNewline; Write-Host "http://localhost:8000"
Write-Host "  API Docs       " -ForegroundColor DarkCyan -NoNewline; Write-Host "http://localhost:8000/docs"
Write-Host "  Frontend React " -ForegroundColor Green    -NoNewline; Write-Host "http://localhost:4300"
Write-Host "  Remotion       " -ForegroundColor Magenta  -NoNewline; Write-Host "http://localhost:3000"
Write-Host "  Log atual      " -ForegroundColor Yellow   -NoNewline; Write-Host (Get-ConfiguredLogLevel)
Write-Host ""
Write-Host "  Ctrl+C para encerrar tudo" -ForegroundColor DarkGray
Write-Host "  -----------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

$services = @(
    @{
        Name = "backend"
        Label = "[BACK] "
        Color = "Cyan"
        FileName = $CMD
        Arguments = '/d /s /c "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"'
        WorkingDirectory = Join-Path $BASE "backend"
        EnvVars = @{
            PYTHONUNBUFFERED = "1"
            PYTHONUTF8 = "1"
            PYTHONIOENCODING = "utf-8"
        }
    },
    @{
        Name = "frontend-react"
        Label = "[REACT]"
        Color = "Green"
        FileName = $CMD
        Arguments = '/d /s /c "npm.cmd run dev"'
        WorkingDirectory = Join-Path $BASE "frontend"
        EnvVars = @{
            LANG = "en_US.UTF-8"
        }
    },
    @{
        Name = "remotion"
        Label = "[REM]  "
        Color = "Magenta"
        FileName = $CMD
        Arguments = '/d /s /c "npm.cmd run dev -- --no-open"'
        WorkingDirectory = Join-Path $BASE "video-renderer"
        EnvVars = @{
            LANG = "en_US.UTF-8"
        }
    },
    @{
        Name = "worker"
        Label = "[WORK] "
        Color = "Yellow"
        FileName = $CMD
        Arguments = '/d /s /c "node native_worker.js"'
        WorkingDirectory = Join-Path $BASE "video-renderer"
        EnvVars = @{
            LANG = "en_US.UTF-8"
        }
    }
)

$running = @()

try {
    foreach ($svc in $services) {
        $running += Start-DevProcess @svc
    }

    while ($true) {
        # Le e imprime output dos servicos (tudo na thread principal)
        Read-AllServiceOutput -Services $running

        # Verifica se algum servico morreu
        foreach ($entry in $running) {
            if ($entry.Process.HasExited) {
                # Drena output restante
                Start-Sleep -Milliseconds 200
                Read-AllServiceOutput -Services $running

                $exitCode = $entry.Process.ExitCode
                Write-Host ""
                Write-Host "  ERRO: $($entry.Name) encerrou (exit code $exitCode)" -ForegroundColor Red
                throw "$($entry.Name) encerrou com codigo $exitCode."
            }
        }

        Start-Sleep -Milliseconds 100
    }
} finally {
    Write-Host ""
    Write-Host "  Encerrando servicos e descendentes..." -ForegroundColor Yellow

    foreach ($entry in $running) {
        if ($entry.Process -and -not $entry.Process.HasExited) {
            Stop-ProcessTree -ProcessId $entry.Process.Id -IncludeRoot
        }
        $entry.Process.Dispose()
    }

    Write-Host "  Pronto." -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "  Pressione ENTER para fechar"
}
