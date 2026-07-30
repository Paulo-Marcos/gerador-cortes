# D-442 — Isolamento de I/O de render em PRD (Defender / Dev Drive)

O Defender escaneia sincronamente cada arquivo de vídeo que o pipeline abre e
grava (ProRes de centenas de MB por chunk, req/res da fila, MP4 finais).
A Microsoft cita até ~30% de ganho em cargas I/O-bound ao tirar esse custo do
caminho quente. Duas opções, da mais segura à mais imediata.

> **Execução manual pelo dono da máquina.** Alterar configuração do antivírus
> é decisão de segurança — o agente prepara, você aplica (PowerShell **como
> administrador**).

## Opção A (recomendada): Dev Drive com performance mode

Volume ReFS dedicado onde o Defender roda em *performance mode* (scan
assíncrono após o fechamento do arquivo, em vez de síncrono no open/write).
Mais seguro que exclusão: os arquivos continuam sendo escaneados.

1. Criar o Dev Drive (Configurações → Sistema → Armazenamento → Dev Drive,
   ou num VHD se não houver partição livre; mínimo 50 GB):
   `Configurações > Sistema > Armazenamento > Discos e volumes > Criar Dev Drive`
2. Confirmar o performance mode (padrão em Dev Drive):

```powershell
Get-MpPreference | Select-Object PerformanceModeStatus
```

3. Mover para o Dev Drive (ex.: `D:\render`) os diretórios quentes e apontar
   o app: o candidato natural é `instance\channels\<canal>\projetos`
   (o caminho é data-driven — `PROJETOS_DIR`/layout de `instance/` — mas o
   move de dados grandes deve ser OFFLINE, como no D-155: o worker trava
   `backend/projetos` no boot).

Custo: precisa de espaço/partição e de um move de dezenas de GB offline.
Se isso for inviável agora, use a Opção B.

## Opção B (imediata): exclusões do Defender

Exclui do scan em tempo real as pastas de trabalho de render e os processos
do pipeline. Menos seguro que a Opção A (arquivos nessas pastas não são
escaneados) — aceitável para diretórios que só recebem saída de
ffmpeg/Remotion geradas localmente.

Rode como **administrador**:

```powershell
# Pastas quentes do render em PRD
Add-MpPreference -ExclusionPath "C:\PRD\gerador-cortes\instance\channels"
Add-MpPreference -ExclusionPath "C:\PRD\gerador-cortes\backend\projetos"

# Processos do pipeline (o binario ffmpeg/node especifico, nao o nome global)
Add-MpPreference -ExclusionProcess "ffmpeg.exe"
Add-MpPreference -ExclusionProcess "node.exe"
```

> `ExclusionProcess` isenta os ARQUIVOS que esses processos tocam, em
> qualquer pasta. Se preferir algo mais estreito, mantenha só as duas
> exclusões de pasta.

Conferir e reverter:

```powershell
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
Get-MpPreference | Select-Object -ExpandProperty ExclusionProcess
```

```powershell
Remove-MpPreference -ExclusionPath "C:\PRD\gerador-cortes\instance\channels"
Remove-MpPreference -ExclusionPath "C:\PRD\gerador-cortes\backend\projetos"
Remove-MpPreference -ExclusionProcess "ffmpeg.exe"
Remove-MpPreference -ExclusionProcess "node.exe"
```

## O que NÃO fazer

- **Não** colocar nada de PRD dentro do OneDrive (o DEV já sofre com isso;
  ver incidente de 20/07). PRD em `C:\PRD` está correto — manter.
- **Não** excluir `C:\` inteiro nem a pasta do repositório DEV (código baixado
  da internet deve continuar escaneado).

## Como medir o ganho

Antes e depois, renderizar o MESMO corte (serial) e comparar o
`duration_sec` de `fase_concluida` no
`instance\channels\default\projetos\<proj>\cortes\<corte>\pipeline_events.jsonl`
e o `duration_ms` do `worker_debug.log` (D-440). Diferença esperada: um dígito
alto a ~30% nas fases com I/O pesado (grade e render_final).
