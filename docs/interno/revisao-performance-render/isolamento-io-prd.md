# D-442 — Isolamento de I/O de render em PRD (Defender / Dev Drive)

O Defender escaneia sincronamente cada arquivo de vídeo que o pipeline abre e
grava (ProRes de centenas de MB por chunk, req/res da fila, MP4 finais).
A Microsoft cita até ~30% de ganho em cargas I/O-bound ao tirar esse custo do
caminho quente.

> **Execução manual pelo dono da máquina.** Alterar configuração do antivírus
> é decisão de segurança — o agente prepara, você aplica (PowerShell **como
> administrador**). Sem elevação não é possível nem *ler* a lista de exclusões.

## Estado atual

**Aplicado em 26/08/2026** (revisão do pente-fino): a exclusão de pasta da
Opção A abaixo está ativa em PRD. As exclusões de processo foram
**deliberadamente descartadas** — ver "O que NÃO fazer".

## Opção A (recomendada e aplicada): exclusão da pasta de dados

Exclui do scan em tempo real a única pasta que concentra o caminho quente do
render. Rode como **administrador**:

```powershell
Add-MpPreference -ExclusionPath "C:\PRD\gerador-cortes\instance\channels"
```

Conferir:

```powershell
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
```

Reverter:

```powershell
Remove-MpPreference -ExclusionPath "C:\PRD\gerador-cortes\instance\channels"
```

**Um comando só, de propósito.** Todo o caminho quente vive sob
`instance\channels\<canal>\projetos` — vídeo baixado, parts `.mkv`, segmentos
`.ts` da grade, chunks de overlay, MP4 final, PNGs do palco, a fila
`fila_remotion/req_*|res_*` e o SQLite. A exclusão é recursiva, sobrevive a
reboot e vale imediatamente: **nada precisa ser reiniciado**, o backend de PRD
segue de pé.

Risco aceito: nada nessa pasta é escaneado. São arquivos de **dados** gerados
localmente por ffmpeg/Remotion/yt-dlp, não executáveis — o vetor teórico seria
exploit de decoder de vídeo, que scan de assinatura não cobre de todo jeito.

## Opção B (quando houver disco sobrando): Dev Drive com performance mode

Volume ReFS dedicado onde o Defender roda em *performance mode* (scan
assíncrono após o fechamento do arquivo, em vez de síncrono no open/write).
Mais seguro que a exclusão — os arquivos continuam sendo escaneados.

> **Inviável na máquina atual (medido em 26/08/2026).** Só existe o volume `C:`
> (NTFS, 456 GB) com **67 GB livres**, e o Dev Drive pede **50 GB de mínimo**:
> criar um deixaria o sistema com ~17 GB de folga. Reavaliar só depois de
> liberar espaço. O `performance mode` **só atua em volume Dev Drive** — sem
> ele, a configuração é irrelevante.

Quando houver espaço:

1. `Configurações > Sistema > Armazenamento > Discos e volumes > Criar Dev Drive`
2. Confirmar o performance mode (padrão em Dev Drive):
   ```powershell
   Get-MpPreference | Select-Object PerformanceModeStatus
   ```
3. Mover para o Dev Drive os diretórios quentes e apontar o app: o candidato é
   `instance\channels\<canal>\projetos` (caminho data-driven via
   `PROJETOS_DIR`/layout de `instance/`). O move de dados grandes deve ser
   **OFFLINE**, como no D-155 — o worker trava a pasta de projetos no boot.
   Volume atual dos dados: **16,8 GB** (4.846 arquivos) em 26/08/2026.

## O que NÃO fazer

- **Não** excluir processos (`-ExclusionProcess "ffmpeg.exe" / "node.exe"`).
  `ExclusionProcess` isenta os arquivos que o processo toca **em qualquer
  pasta do disco** — com `node.exe` na lista, todo `npm install` da máquina
  passa a gravar sem escaneamento, e npm é vetor conhecido de supply-chain.
  O ganho sobre a exclusão de pasta é marginal (ela já cobre o caminho quente).
  Avaliado e descartado no pente-fino de 26/08/2026.
- **Não** excluir `C:\PRD\gerador-cortes\backend\projetos` — a pasta **não
  existe** em PRD (constava por engano na versão anterior deste runbook).
- **Não** colocar nada de PRD dentro do OneDrive (o DEV já sofre com isso;
  ver incidente de 20/07). PRD em `C:\PRD` está correto — manter.
- **Não** excluir `C:\` inteiro nem a pasta do repositório DEV (código baixado
  da internet deve continuar escaneado). O DEV não precisa de exclusão: sua
  pasta de dados é praticamente vazia (não é onde os renders rodam).

## Como medir o ganho

O `pipeline_events.jsonl` de cada corte já registra `duration_sec` por fase —
a medição sai de graça, sem render dedicado. Compare a razão
**duração-da-fase ÷ duração-do-clipe** dos renders novos contra a linha de
base, em vez de comparar segundos absolutos (que variam com o tamanho do
corte).

Linha de base medida em 26/08/2026 sobre 328 renders de PRD:

| Métrica | Mediana | p90 |
|---|---|---|
| pipeline completo | 1.138 s | 3.167 s |
| fase `grade` | 992 s | 3.091 s |
| fase `overlays` (∥ à grade) | 337 s | 857 s |
| fase `render_final` | 175 s | 686 s |

Referência normalizada de `analise-2026-07-30.md`: grade serial a **1,16x** a
duração do clipe, contra **4,68x** sob concorrência — I/O e contenção pesam
mais que compute, então prefira comparar renders em condição parecida
(serial com serial).

Um par antes/depois isolado é ruidoso nesta máquina (15 W, térmica variável):
prefira a mediana de vários renders subsequentes.
