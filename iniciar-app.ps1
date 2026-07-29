# iniciar-app.ps1 - Sobe o CutCut (se ainda nao estiver no ar) e abre a janela
# do app instalado no Edge. E o cerebro do atalho da area de trabalho; quem
# esconde o console e o iniciar-app.vbs, que chama este script.
#
# D-432. Duas garantias que valem mais que o resto do arquivo:
#   1. NUNCA derruba nada. Se o /api/health ja responde, so abre a janela.
#      Um clique acidental com a aplicacao no ar nao pode reiniciar servico.
#   2. Le as portas do PROPRIO checkout (dev.ports.local.ps1 quando existe),
#      entao o atalho do DEV e o do PROD convivem sem disputar porta - a
#      mesma regra do D-370.

$ErrorActionPreference = 'Stop'
# A barra de progresso do Invoke-WebRequest custa mais que a propria requisicao
# em PS 5.1; desligada, a sondagem fica na casa dos milissegundos.
$ProgressPreference = 'SilentlyContinue'

# Portas: defaults de PROD, sobrescritos pelo override local do checkout.
$BackendPort  = 8000
$FrontendPort = 4300
$portsOverride = Join-Path $PSScriptRoot 'dev.ports.local.ps1'
if (Test-Path $portsOverride) { . $portsOverride }

# Ajustes opcionais desta maquina (untracked): $AppName, $EdgeAppId.
$AppName  = 'CutCut'
$EdgeAppId = $null
$appOverride = Join-Path $PSScriptRoot 'app.local.ps1'
if (Test-Path $appOverride) { . $appOverride }

$healthUrl = "http://localhost:$BackendPort/api/health"
$appUrl    = "http://localhost:$FrontendPort"
$logDir    = Join-Path $PSScriptRoot 'logs'

<#
Sonda um servico. Sempre por `localhost`, nunca por 127.0.0.1: o uvicorn
escuta em IPv4 e o Vite responde por IPv6, e so o nome cobre os dois.

$Tentativas existe porque a PRIMEIRA requisicao de uma sessao PowerShell paga
a deteccao de proxy do Windows e chega a estourar timeouts curtos. Um falso
negativo aqui e caro: o script concluiria que a aplicacao esta fora e tentaria
subir por cima da que ja esta rodando.
#>
function Test-NoAr {
    param([string]$Url, [int]$Tentativas = 1)
    for ($i = 1; $i -le $Tentativas; $i++) {
        try {
            if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $Url).StatusCode -eq 200) {
                return $true
            }
        } catch {
            if ($i -lt $Tentativas) { Start-Sleep -Milliseconds 500 }
        }
    }
    return $false
}

<#
Argumentos que abrem a janela do app instalado. Preferimos o --app-id porque e
ele que carrega a identidade do app instalado (nome e icone que o usuario ja
configurou no Edge); o --app=<url> abre uma janela igualmente limpa, mas
anonima. O id e descoberto no atalho que o proprio Edge criou no menu Iniciar
- assim ninguem precisa colar hash em arquivo nenhum.
#>
function Get-EdgeAppArgs {
    param([string]$Url)

    if ($EdgeAppId) { return "--profile-directory=Default --app-id=$EdgeAppId" }

    # O Edge espalha o atalho do app instalado em lugares diferentes conforme
    # o que o usuario marca na instalacao (menu Iniciar, area de trabalho,
    # barra de tarefas) - varremos os tres.
    $locais = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'),
        [Environment]::GetFolderPath('Desktop')
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($locais) {
        $shell = New-Object -ComObject WScript.Shell
        $doEdge = Get-ChildItem -Path $locais -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
            ForEach-Object {
                $lnk = $shell.CreateShortcut($_.FullName)
                if ($lnk.TargetPath -like '*msedge.exe' -and $lnk.Arguments -match '--app-id=') {
                    [pscustomobject]@{ Nome = $_.BaseName; Args = $lnk.Arguments }
                }
            }
        # Casa pelo nome do app; com um unico app do Edge instalado, aceita ele.
        $escolhido = @($doEdge | Where-Object { $_.Nome -like "*$AppName*" })[0]
        if (-not $escolhido) {
            $unicos = @($doEdge | Sort-Object Args -Unique)
            if ($unicos.Count -eq 1) { $escolhido = $unicos[0] }
        }
        if ($escolhido) { return $escolhido.Args }
    }

    return "--app=$Url"
}

function Open-Janela {
    param([string]$Url)
    $chave = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe'
    $edge = (Get-ItemProperty -Path $chave -ErrorAction SilentlyContinue).'(default)'
    if ($edge -and (Test-Path $edge)) {
        Start-Process -FilePath $edge -ArgumentList (Get-EdgeAppArgs -Url $Url)
    } else {
        # Sem Edge, cai no navegador padrao: melhor uma janela comum que nenhuma.
        Start-Process $Url
    }
}

if (-not (Test-NoAr -Url $healthUrl -Tentativas 3)) {
    Start-Process -FilePath 'powershell' -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', (Join-Path $PSScriptRoot 'dev.ps1'), '-Silent'
    )

    # Espera os DOIS: so o backend de pe ainda abriria a janela em branco. O
    # primeiro boot inclui o bundle do Remotion, dai a folga de 2 minutos.
    $limite = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $limite) {
        if ((Test-NoAr -Url $healthUrl) -and (Test-NoAr -Url $appUrl)) { break }
        Start-Sleep -Seconds 1
    }
}

if (-not (Test-NoAr -Url $appUrl)) {
    # Falhou calado: abre o log, que e a unica janela util neste ponto.
    if (Test-Path $logDir) { Start-Process $logDir }
    exit 1
}

Open-Janela -Url $appUrl
