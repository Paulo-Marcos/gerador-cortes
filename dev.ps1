# dev.ps1 - Inicia o ambiente local em um unico terminal.
# WHY BombaDeSaida: event handlers .NET (OutputDataReceived) executam ScriptBlocks
# em ThreadPool threads, o que crasha o host PowerShell (exit code 2). A leitura
# dos pipes roda em threads C# puras, e o console e escrito so no laco principal.
#
# D-432: -Silent e o modo usado pelo atalho da area de trabalho (iniciar-app.vbs),
# que roda este script com a janela escondida. Nesse modo NAO pode haver
# Read-Host: um prompt invisivel deixaria o supervisor pendurado para sempre
# segurando as portas. Em troca, a saida vai para logs/app-<data>.log - sem
# console na tela, o log e o unico jeito de ver o que aconteceu.
param([switch]$Silent)

if ($Silent) {
    $logDir = Join-Path $PSScriptRoot "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Start-Transcript -Path (Join-Path $logDir "app-$(Get-Date -Format 'yyyyMMdd').log") -Append | Out-Null
}

function Wait-Enter {
    param([string]$Message = "  Pressione ENTER para fechar")
    if (-not $Silent) { Read-Host $Message | Out-Null }
}

trap {
    Write-Host ""
    Write-Host "  === ERRO FATAL ===" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host ""
    Wait-Enter
    exit 1
}

$BASE = $PSScriptRoot
$CMD = $env:ComSpec
if ([string]::IsNullOrWhiteSpace($CMD)) {
    $CMD = "cmd.exe"
}

# A7: usa o Python DESTE checkout quando ele tem um venv, senao cai no global.
# Sem venv, DEV e PROD compartilham a mesma instalacao: atualizar uma
# dependencia "so para testar no DEV" mexia no PROD no mesmo ato, e o
# `pip install -r requirements.txt` de qualquer um dos lados atingia o outro.
# O fallback existe para um clone novo subir antes de qualquer setup — quem
# nao criou o venv continua rodando exatamente como antes.
$VenvPython = Join-Path $BASE "backend\.venv\Scripts\python.exe"
$PythonExe = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

$env:PYTHONUNBUFFERED = "1"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

# Portas dos servicos. Os defaults sao as portas de PROD: o checkout de
# producao roda este arquivo como esta no repositorio e NAO muda de porta.
# Um `dev.ports.local.ps1` ao lado deste script (untracked, so existe nos
# checkouts de desenvolvimento) sobrescreve estes valores para o DEV subir em
# portas alternativas - assim DEV e PROD convivem na mesma maquina sem
# disputar porta. O frontend recebe VITE_API_URL derivado de $BackendPort,
# entao nao ha como o DEV falar com o backend do PROD por engano.
$BackendPort  = 8000
$FrontendPort = 4300
# Fora da faixa 3000-3100 que o @remotion/renderer usa para servir o bundle
# durante o render (serve-static.js: from 3000, to 3100 — hardcoded no pacote).
# Com o Studio dentro dela havia corrida de porta: o render testa se esta livre
# e so DEPOIS faz o bind, entao com o Studio subindo a 3000 aparecia livre, o
# render a escolhia, e o rebuild do Studio derrubava a conexao com
# ERR_CONNECTION_RESET. Deve casar com `remotion_studio_port` do backend.
$RemotionPort = 3200
$WorkerPort   = 3001

$portsOverride = Join-Path $PSScriptRoot "dev.ports.local.ps1"
if (Test-Path $portsOverride) { . $portsOverride }

$projectPorts = @($BackendPort, $FrontendPort, $RemotionPort, $WorkerPort)

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

function Test-CortadorProcess {
    # D-370: so encerra processos deste checkout, casados pelo caminho absoluto
    # do projeto ($BASE) no CommandLine/ExecutablePath.
    # Tokens genericos (uvicorn/app.main, native_worker.js, vite, remotion, a
    # porta) foram removidos de proposito: eles NAO distinguem este DEV do PROD
    # (outro checkout, ex.: producao) nem de apps de terceiros que usam node/vite/porta
    # 3000 (ex.: BolsoFundo), e o sweep antigo matava esses processos alheios.
    # D-436: backend e worker deixaram de ser "pathless" - agora sao lancados
    # com o caminho absoluto na linha de comando (--app-dir e o .js completo),
    # entao a prova de posse abaixo tambem os alcanca quando ficam orfaos. Antes
    # so o Ctrl+C os encerrava, pela arvore, no bloco finally - e um restart que
    # derruba o supervisor a forca deixava worker acumulado a cada inicio.
    param([string]$CommandLine, [string]$ExecutablePath)

    $cl  = if ($CommandLine)    { $CommandLine }    else { "" }
    $exe = if ($ExecutablePath) { $ExecutablePath } else { "" }

    return ($cl -like "*$BASE*" -or $exe -like "*$BASE*")
}

function Clear-DevEnvironment {
    Write-Host "  Limpando portas/processos antigos..." -ForegroundColor DarkGray

    # Candidatos: donos das portas do projeto + node/python com linha de comando
    # nossa. Donos de porta so entram na lista; o corte final passa pela prova de
    # posse abaixo, entao porta ocupada por app alheio nao e encerrada.
    $pidsByPort = foreach ($port in $projectPorts) {
        Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess
    }

    $pidsByCmd = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { Test-CortadorProcess -CommandLine $_.CommandLine -ExecutablePath $_.ExecutablePath } |
        Select-Object -ExpandProperty ProcessId

    $allPids = @($pidsByPort) + @($pidsByCmd) |
        Where-Object { $_ -gt 0 -and $_ -ne $PID } |
        Select-Object -Unique

    foreach ($targetPid in $allPids) {
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
        if (-not $cim) { continue }

        if (Test-CortadorProcess -CommandLine $cim.CommandLine -ExecutablePath $cim.ExecutablePath) {
            Write-Host "  Encerrando $($cim.Name) (PID $targetPid)" -ForegroundColor DarkYellow
            Stop-ProcessTree -ProcessId $targetPid -IncludeRoot
        } else {
            Write-Host "  Porta ocupada por $($cim.Name) (PID $targetPid) alheio ao CutCut - ignorando" -ForegroundColor DarkGray
        }
    }

    # FFmpeg: apenas os deste projeto (nunca global - poderia matar render de PROD).
    Get-CimInstance Win32_Process -Filter "Name = 'ffmpeg.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$BASE*" } |
        ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
}

function Get-PortasOcupadasAlheias {
    # D-626: depois da limpeza, porta do projeto ainda em LISTEN e de processo
    # alheio. Antes o script so avisava em cinza e seguia; o backend/vite caia
    # adiante com um erro que nao apontava a causa. Espera ate ~5s porque um
    # processo nosso recem-encerrado pode demorar a soltar o socket.
    for ($tentativa = 0; $tentativa -lt 10; $tentativa++) {
        $ocupadas = @(foreach ($port in $projectPorts) {
            Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -First 1 | ForEach-Object {
                    $dono = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
                    # Processo nosso ainda morrendo nao e "alheio": so espera.
                    if ($dono -and (Test-CortadorProcess -CommandLine $dono.CommandLine -ExecutablePath $dono.ExecutablePath)) { return }
                    [pscustomobject]@{
                        Porta = $port
                        Nome  = if ($dono) { $dono.Name } else { "desconhecido" }
                        Pid   = $_.OwningProcess
                    }
                }
        })
        if ($ocupadas.Count -eq 0) { return @() }
        Start-Sleep -Milliseconds 500
    }
    return $ocupadas
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

# Auto-cura do ambiente Remotion antes de subir os servicos (D-359).
# Duas falhas silenciosas recorrentes deixavam o JSON de cenas sair mas nenhum
# overlay .mov ser gerado (video final sem overlays):
#   1. video-renderer/node_modules vazio/incompleto -> `npx remotion` nao resolve.
#   2. Chrome Headless Shell ausente -> no Node 24 o extract-zip extrai so
#      ABOUT+LICENSE em silencio e todo render sai exit 0 sem gerar arquivo.
function Confirm-RemotionReady {
    $vr = Join-Path $BASE "video-renderer"

    # Marcador preciso: sem o CLI do Remotion nenhum overlay renderiza. Cobre o
    # caso de node_modules existente porem vazio (npm ci interrompido/limpo).
    $cliMarker = Join-Path $vr "node_modules\@remotion\cli\package.json"
    if (-not (Test-Path $cliMarker)) {
        Write-Host "  video-renderer/node_modules incompleto - rodando npm ci..." -ForegroundColor DarkYellow
        Push-Location $vr
        try {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci falhou no video-renderer (exit $LASTEXITCODE)." }
        } finally {
            Pop-Location
        }
    }

    # Idempotente: sai rapido quando o exe ja responde a --version.
    Write-Host "  Verificando Chrome Headless Shell do Remotion..." -ForegroundColor DarkGray
    & (Join-Path $BASE "bin\ensure-remotion-browser.ps1")
    if ($LASTEXITCODE -ne 0) {
        throw "ensure-remotion-browser falhou (exit $LASTEXITCODE) - overlays nao renderizariam."
    }
}

# Cria processo SEM event handlers — a saida e lida pela BombaDeSaida
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

    # D-607: a leitura dos pipes sai do laco do PowerShell (ver BombaDeSaida).
    $bomba = [CutCut.BombaDeSaida]::new($script:CapacidadeDaFila)
    $bomba.Ler($process.StandardOutput)
    $bomba.Ler($process.StandardError)

    return @{
        Name    = $Name
        Label   = $Label
        Color   = $Color
        Process = $process
        Bomba   = $bomba
    }
}

# Imprime uma linha de servico com cor
function Write-ServiceLine {
    param(
        [string]$Label,
        [string]$Color,
        [string]$Line
    )

    if (-not $Line -or $Line.Trim() -eq "") { return }

    # D-432: em modo silencioso nao ha console para colorir, e [Console]::Write
    # escreve direto no .NET - passando POR FORA do Start-Transcript, que so
    # enxerga o host do PowerShell. Era por isso que o log saia com o boot
    # inteiro e nenhuma linha de servico depois. Write-Host passa pelo host e
    # portanto e transcrito.
    if ($Silent) {
        Write-Host "$Label $Line"
        return
    }

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

# Le output de todos os servicos a partir das filas das bombas.
#
# D-607: ler o pipe e escrever no console no MESMO laco amarrava a vazao dos
# servicos a velocidade do terminal. O Windows Terminal desenha devagar - medido
# 100 a 300 linhas/s com a janela visivel, e menos ainda fora de foco. Quando o
# console atrasava, o laco atrasava, o pipe de 4KB enchia e o `print` do backend
# BLOQUEAVA dentro do event loop: "buscar fires" ficava carregando ate alguem
# trazer a janela para frente. Agora cada pipe e esvaziado por uma thread .NET
# que so enfileira; o console fica atrasado, mas nenhum servico espera por ele.
#
# O teto por ciclo evita starvation: com um servico tagarela, o laco cede a vez
# para os demais e para a checagem de processo morto em vez de girar sem fim.
# Devolve $true se leu alguma linha — o chamador so dorme quando nao houve nada.
$script:MaxLinhasPorCiclo = 500
# Linhas guardadas por servico enquanto o console nao da conta. Cheia, a bomba
# DESCARTA e conta: perder log e barato, congelar o servidor nao e.
$script:CapacidadeDaFila = 20000

# Thread em C# e nao em ScriptBlock: ScriptBlock rodando em thread do .NET
# derruba o host do PowerShell (exit code 2).
Add-Type -TypeDefinition @'
using System.Collections.Concurrent;
using System.IO;
using System.Threading;

namespace CutCut {
    public sealed class BombaDeSaida {
        private readonly BlockingCollection<string> _fila;
        private long _descartadas;

        public BombaDeSaida(int capacidade) {
            _fila = new BlockingCollection<string>(capacidade);
        }

        public void Ler(TextReader leitor) {
            var thread = new Thread(() => {
                try {
                    string linha;
                    while ((linha = leitor.ReadLine()) != null) {
                        if (!_fila.TryAdd(linha)) Interlocked.Increment(ref _descartadas);
                    }
                } catch (IOException) {
                    // Pipe fechado com o processo morrendo: nada mais a ler.
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        public bool TentarPegar(out string linha) {
            return _fila.TryTake(out linha);
        }

        public long TomarDescartadas() {
            return Interlocked.Exchange(ref _descartadas, 0);
        }
    }
}
'@

function Read-AllServiceOutput {
    param([array]$Services)

    $leuAlgo = $false

    foreach ($svc in $Services) {
        $perdidas = $svc.Bomba.TomarDescartadas()
        if ($perdidas -gt 0) {
            Write-ServiceLine -Label $svc.Label -Color $svc.Color -Line "[LOG] $perdidas linha(s) descartada(s): console nao acompanhou."
        }

        $n = 0
        $line = $null
        while ($n -lt $script:MaxLinhasPorCiclo -and $svc.Bomba.TentarPegar([ref]$line)) {
            Write-ServiceLine -Label $svc.Label -Color $svc.Color -Line $line
            $n++; $leuAlgo = $true
        }
    }

    return $leuAlgo
}

Clear-Host
Write-Host ""
Write-Host "  CutCut" -ForegroundColor Cyan -NoNewline
Write-Host " - iniciando..." -ForegroundColor DarkGray
Write-Host ""

Clear-DevEnvironment
$portasOcupadas = Get-PortasOcupadasAlheias
if ($portasOcupadas.Count -gt 0) {
    Write-Host ""
    Write-Host "  === PORTA OCUPADA ===" -ForegroundColor Red
    foreach ($p in $portasOcupadas) {
        Write-Host "  Porta $($p.Porta) em uso por $($p.Nome) (PID $($p.Pid)), que nao e deste checkout." -ForegroundColor Red
    }
    Write-Host "  Feche esse programa ou escolha outras portas em dev.ports.local.ps1" -ForegroundColor Yellow
    Write-Host "  (copie de dev.ports.local.ps1.example)." -ForegroundColor Yellow
    Write-Host ""
    Wait-Enter
    exit 1
}

Confirm-RemotionReady

Write-Host ""
Write-Host "  Backend        " -ForegroundColor DarkCyan -NoNewline; Write-Host "http://localhost:$BackendPort"
Write-Host "  API Docs       " -ForegroundColor DarkCyan -NoNewline; Write-Host "http://localhost:$BackendPort/docs"
Write-Host "  Frontend React " -ForegroundColor Green    -NoNewline; Write-Host "http://localhost:$FrontendPort"
Write-Host "  Remotion       " -ForegroundColor Magenta  -NoNewline; Write-Host "http://localhost:$RemotionPort"
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
        # D-436: `--app-dir <caminho>` em vez de contar so com o cwd — mesma
        # razao do worker: sem o checkout na linha de comando, um backend orfao
        # nao e reconhecido pela limpeza e fica segurando a porta.
        Arguments = "/d /s /c `"`"$PythonExe`" -m uvicorn app.main:app --app-dir `"$(Join-Path $BASE 'backend')`" --host 0.0.0.0 --port $BackendPort --reload`""
        WorkingDirectory = Join-Path $BASE "backend"
        EnvVars = @{
            PYTHONUNBUFFERED = "1"
            PYTHONUTF8 = "1"
            PYTHONIOENCODING = "utf-8"
            BACKEND_PUBLIC_URL = "http://localhost:$BackendPort"
        }
    },
    @{
        Name = "frontend-react"
        Label = "[REACT]"
        Color = "Green"
        FileName = $CMD
        Arguments = "/d /s /c `"npm.cmd run dev -- --port $FrontendPort --strictPort`""
        WorkingDirectory = Join-Path $BASE "frontend"
        EnvVars = @{
            LANG = "en_US.UTF-8"
            VITE_API_URL = "http://localhost:$BackendPort/api"
        }
    },
    @{
        Name = "remotion"
        Label = "[REM]  "
        Color = "Magenta"
        FileName = $CMD
        Arguments = "/d /s /c `"npm.cmd run dev -- --no-open --port $RemotionPort`""
        WorkingDirectory = Join-Path $BASE "video-renderer"
        EnvVars = @{
            LANG = "en_US.UTF-8"
            REMOTION_BACKEND_URL = "http://localhost:$BackendPort"
        }
    },
    @{
        Name = "worker"
        Label = "[WORK] "
        Color = "Yellow"
        FileName = $CMD
        # D-436: caminho ABSOLUTO de proposito, embora o cwd ja seja este. E o
        # que poe o checkout na linha de comando do node e devolve o worker ao
        # alcance de Test-CortadorProcess; com "node native_worker.js" ele ficava
        # invisivel para a limpeza e sobrevivia a cada reinicio.
        Arguments = "/d /s /c `"node `"$(Join-Path $BASE 'video-renderer\native_worker.js')`"`""
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
        $leuAlgo = Read-AllServiceOutput -Services $running

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

        # So dorme quando nao havia nada para ler. Durante uma rajada o laco
        # gira sem pausa e o pipe nunca chega a encher.
        if (-not $leuAlgo) { Start-Sleep -Milliseconds 100 }
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
    Wait-Enter
    if ($Silent) { Stop-Transcript | Out-Null }
}
