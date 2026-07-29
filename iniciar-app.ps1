# iniciar-app.ps1 - Sobe o CutCut (se ainda nao estiver no ar) e abre a janela
# do app instalado no Edge. E o cerebro do atalho da area de trabalho; quem
# esconde o console e o iniciar-app.vbs, que chama este script.
#
# D-432. Duas garantias que valem mais que o resto do arquivo:
#   1. Com a aplicacao parada, clicar no atalho sobe tudo e abre a janela.
#      Com ela no ar, PERGUNTA: reiniciar, encerrar ou cancelar. A caixa
#      avisa quando ha trabalho pesado em andamento, porque abortar um upload
#      deixa video parcial no canal. $ReiniciarSemPerguntar = $true no
#      app.local.ps1 pula a caixa e reinicia direto.
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

# Ajustes opcionais desta maquina (untracked): $AppName, $EdgeAppId,
# $ReiniciarSemPerguntar.
$AppName  = 'CutCut'
$EdgeAppId = $null
$ReiniciarSemPerguntar = $false
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

<#
Trabalho pesado em andamento (bruto, render, upload) segundo a fila global.
Em caso de duvida devolve lista vazia - o pedido do dono e reiniciar, entao
uma API muda nao pode virar um bloqueio.
#>
function Get-JobsAtivos {
    try {
        $fila = Invoke-RestMethod -TimeoutSec 5 -Uri "http://localhost:$BackendPort/api/export/fila-global"
        return @($fila.jobs | Where-Object { $_.estado -in @('aguardando', 'rodando') })
    } catch { return @() }
}

<#
Caixa de escolha com botoes rotulados. Existe em vez de um MessageBox porque
os botoes de um MessageBox sao Sim/Nao/Cancelar - rotulos que nao dizem qual e
qual nas perguntas daqui.

$Botoes: lista de @{ Texto = '...'; Resultado = '...' }. O ULTIMO e o de
escape: e o que Esc e o X devolvem.
#>
function Show-Escolha {
    param([string]$Texto, [array]$Botoes)

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $largura = 470
    $form = New-Object System.Windows.Forms.Form
    $form.Text = $AppName
    $form.ClientSize = New-Object System.Drawing.Size($largura, 200)
    $form.FormBorderStyle = 'FixedDialog'
    $form.StartPosition = 'CenterScreen'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    # Nasce escondido pelo wscript: sem TopMost a caixa aparece atras de tudo.
    $form.TopMost = $true
    $icone = Join-Path $PSScriptRoot 'frontend\public\app-icon.ico'
    if (Test-Path $icone) { try { $form.Icon = New-Object System.Drawing.Icon($icone) } catch {} }

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Texto
    $label.SetBounds(16, 16, $largura - 32, 130)
    $form.Controls.Add($label)

    # Hashtable, e nao uma variavel $script:, porque GetNewClosure() embrulha o
    # handler num modulo proprio - la dentro `$script:` aponta para o escopo do
    # closure, nao para o desta funcao, e a escolha do usuario se perdia (o
    # clique em Reiniciar voltava 'cancelar'). O hashtable e capturado por
    # referencia, entao mexer numa chave dele e visto aqui fora.
    # Tambem e o valor que sobra quando a caixa e fechada no X.
    $escape = $Botoes[-1].Resultado
    $estado = @{ escolha = $escape }
    $x = $largura - 16 - (90 * $Botoes.Count)
    foreach ($b in $Botoes) {
        $botao = New-Object System.Windows.Forms.Button
        $botao.Text = $b.Texto
        $botao.SetBounds($x, 156, 82, 28)
        $x += 90
        $resultado = $b.Resultado
        $botao.Add_Click({ $estado.escolha = $resultado; $form.Close() }.GetNewClosure())
        $form.Controls.Add($botao)
        if ($b.Resultado -eq $escape) { $form.CancelButton = $botao }
    }

    # O processo nasce com a janela escondida (wscript Run ..., 0) e o Windows
    # aplica esse "esconde" a PRIMEIRA janela de topo que ele criar - esta
    # caixa inclusive. Sem forcar SW_SHOW ela nasce invisivel e o launcher
    # trava esperando um clique que ninguem consegue dar. TopMost/Activate
    # sozinhos NAO resolvem: nao desfazem o SW_HIDE inicial.
    if (-not ('CutCut.Janela' -as [type])) {
        Add-Type -Namespace CutCut -Name Janela -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
'@
    }
    $form.Add_Shown({
        [CutCut.Janela]::ShowWindow($form.Handle, 5) | Out-Null   # SW_SHOW
        [CutCut.Janela]::SetForegroundWindow($form.Handle) | Out-Null
        $form.Activate()
    }.GetNewClosure())
    [void]$form.ShowDialog()
    $form.Dispose()
    return $estado.escolha
}

<#
Pergunta o que fazer quando ja ha aplicacao no ar: 'reiniciar', 'encerrar' ou
'cancelar'. O aviso de trabalho pesado e o que torna a escolha informada -
abortar um upload deixa video parcial no canal.
#>
function Show-DialogoExecucaoAtiva {
    $ativos = Get-JobsAtivos
    $texto = "O $AppName ja esta em execucao."
    if ($ativos.Count -gt 0) {
        $lista = ($ativos | Select-Object -First 5 | ForEach-Object { "   - $($_.rotulo) ($($_.estado))" }) -join "`r`n"
        $texto += "`r`n`r`nATENCAO - $($ativos.Count) trabalho(s) em andamento:`r`n$lista" +
                  "`r`n`r`nReiniciar ou encerrar aborta tudo isso. Upload do YouTube" +
                  " interrompido deixa video parcial no canal."
    } else {
        $texto += "`r`nNao ha trabalho pesado em andamento."
    }

    return Show-Escolha -Texto $texto -Botoes @(
        @{ Texto = 'Reiniciar'; Resultado = 'reiniciar' },
        @{ Texto = 'Encerrar';  Resultado = 'encerrar'  },
        @{ Texto = 'Cancelar';  Resultado = 'cancelar'  }
    )
}

<# Espera o backend sair do ar. True quando caiu. #>
function Wait-Queda {
    param([int]$Segundos = 25)
    $ate = (Get-Date).AddSeconds($Segundos)
    while ((Get-Date) -lt $ate) {
        if (-not (Test-NoAr -Url $healthUrl)) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return (-not (Test-NoAr -Url $healthUrl))
}

<# Processos segurando as portas deste checkout (com a linha de comando). #>
function Get-DonosDasPortas {
    $ids = foreach ($porta in @($BackendPort, $FrontendPort)) {
        Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess
    }
    @($ids | Where-Object { $_ -gt 4 } | Select-Object -Unique) |
        ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$_" -ErrorAction SilentlyContinue } |
        Where-Object { $_ }
}

<#
Ultimo recurso: derruba quem segura as portas. Em RODADAS porque o uvicorn
--reload entrega o socket a um filho (multiprocessing) e o dono relatado muda
a cada morte - matar uma vez so deixava a porta presa pelo filho seguinte.
#>
function Stop-DonosDasPortas {
    for ($i = 1; $i -le 5; $i++) {
        $donos = @(Get-DonosDasPortas)
        if (-not $donos) { break }
        foreach ($d in $donos) { Stop-ArvoreDeProcessos -ProcessId $d.ProcessId }
        Start-Sleep -Seconds 1
    }
    return (Wait-Queda -Segundos 10)
}

<#
Encerra tudo do checkout e CONFIRMA que caiu.

A limpeza do clean-dev casa processos pelo caminho do checkout; um backend
lancado antes do D-436 nao carrega esse caminho, sobrevive e segue segurando a
porta - e o clique seguinte dizia "ja esta em execucao" sem explicar nada
(D-438). Sobrando alguem, mostra quem e e pergunta antes de forcar.
#>
function Stop-Aplicacao {
    Stop-ExecucaoAnterior
    & (Join-Path $PSScriptRoot 'clean-dev.ps1') | Out-Null
    if (Wait-Queda) { return $true }

    $lista = (@(Get-DonosDasPortas) | Select-Object -First 4 | ForEach-Object {
        $cl = ($_.CommandLine -replace '\s+', ' ')
        "   - PID $($_.ProcessId): " + $cl.Substring(0, [Math]::Min(64, $cl.Length))
    }) -join "`r`n"

    $texto = "Nao consegui encerrar o $AppName pelo caminho normal." +
             "`r`n`r`nAinda ha processo segurando as portas $BackendPort/$FrontendPort" +
             ":`r`n$lista" +
             "`r`n`r`nEnquanto ele viver, todo clique no atalho vai dizer que a" +
             " aplicacao ja esta em execucao. Forcar o encerramento?"

    if ((Show-Escolha -Texto $texto -Botoes @(
            @{ Texto = 'Forcar';   Resultado = 'forcar'   },
            @{ Texto = 'Cancelar'; Resultado = 'cancelar' }
        )) -ne 'forcar') { return $false }

    return (Stop-DonosDasPortas)
}

<#
Encerra o supervisor da execucao anterior. Nao precisa ser delicado com os
filhos: o dev.ps1 novo comeca limpando portas e processos deste checkout, e
e esse mesmo caminho que ja rodava a cada boot.
#>
<# Encerra o processo e TODOS os descendentes, das folhas para a raiz. #>
function Stop-ArvoreDeProcessos {
    param([int]$ProcessId)
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-ArvoreDeProcessos -ProcessId $_.ProcessId }
    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

function Stop-ExecucaoAnterior {
    # Casa o "-File <caminho>\dev.ps1" com que o supervisor e lancado, e nao a
    # simples MENCAO do caminho: um terminal aberto lendo ou editando o arquivo
    # tem o caminho na linha de comando e nao pode ser confundido com ele.
    $alvo = Join-Path $PSScriptRoot 'dev.ps1'
    $padrao = '-File\s+"?' + [regex]::Escape($alvo) + '"?'
    # D-436: pela ARVORE, nao so a raiz. Matar o supervisor a forca nao roda o
    # finally dele (que era quem encerrava os filhos), e worker e backend sao
    # lancados sem o caminho do checkout na linha de comando - orfaos, ficam
    # invisiveis para a limpeza por caminho do dev.ps1 e sobrevivem a todo
    # restart. Foi assim que tres native_worker.js acumularam.
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match $padrao -and $_.ProcessId -ne $PID } |
        ForEach-Object { Stop-ArvoreDeProcessos -ProcessId $_.ProcessId }
}

$estavaNoAr = Test-NoAr -Url $healthUrl -Tentativas 3

if ($estavaNoAr -and -not $ReiniciarSemPerguntar) {
    switch (Show-DialogoExecucaoAtiva) {
        'cancelar' {
            # So traz a janela do app; nada e tocado.
            Open-Janela -Url $appUrl
            exit 0
        }
        'encerrar' {
            if (Stop-Aplicacao) { exit 0 }
            exit 1
        }
    }
}

# Reiniciar: garante a QUEDA antes de subir. Sem isso o dev.ps1 novo disputa a
# porta com o backend que ainda esta morrendo e o boot morre no primeiro
# segundo.
if ($estavaNoAr) {
    if (-not (Stop-Aplicacao)) { exit 1 }
} else {
    Stop-ExecucaoAnterior
}

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

if (-not (Test-NoAr -Url $appUrl)) {
    # Falhou calado: abre o log, que e a unica janela util neste ponto.
    if (Test-Path $logDir) { Start-Process $logDir }
    exit 1
}

Open-Janela -Url $appUrl
